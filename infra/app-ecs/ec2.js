const aws = require("@pulumi/aws");
const pulumi = require('@pulumi/pulumi');


async function GetUserData(efs,configuration) {
    let userData = pulumi.all([efs.id]).apply(
        ([efsId]) => Buffer.from(`

        #! /bin/bash

        set -eux

        echo "### HARDENING DOCKER"
        sed -i "s/1024:4096/65535:65535/g" "/etc/sysconfig/docker"

        echo "### HARDENING EC2 INSTACE"
        echo "ulimit -u unlimited" >> /etc/rc.local
        echo "ulimit -n 1048576" >> /etc/rc.local
        echo "vm.max_map_count=262144" >> /etc/sysctl.conf
        echo "fs.file-max=65536" >> /etc/sysctl.conf
        /sbin/sysctl -p /etc/sysctl.conf


        echo "### INSTALL PACKAGES"
        yum update -y
        yum install -y amazon-efs-utils aws-cli


        echo "### SETUP EFS"
        EFS_DIR=/mnt/efs
        EFS_ID=${efsId}

        mkdir -p \${EFS_DIR}
        echo "\${EFS_ID}:/ \${EFS_DIR} efs tls,_netdev" >> /etc/fstab

        for i in $(seq 1 20); do mount -a -t efs defaults && break || sleep 60; done

        echo "### SETUP AGENT"

        echo "ECS_CLUSTER=ecs-${configuration.ecsName}-${configuration.account}-${configuration.region}" >> /etc/ecs/ecs.config
        echo "ECS_ENABLE_SPOT_INSTANCE_DRAINING=true" >> /etc/ecs/ecs.config
        `).toString('base64')
    );

    return userData;
}

async function GetGpuUserData(efs,configuration) {
    let userData = pulumi.all([efs.id]).apply(
        ([efsId]) => Buffer.from(`

        #! /bin/bash

        set -eux

        echo "### HARDENING DOCKER"
        sed -i "s/1024:4096/65535:65535/g" "/etc/sysconfig/docker"

        echo "### HARDENING EC2 INSTACE"
        echo "ulimit -u unlimited" >> /etc/rc.local
        echo "ulimit -n 1048576" >> /etc/rc.local
        echo "vm.max_map_count=262144" >> /etc/sysctl.conf
        echo "fs.file-max=65536" >> /etc/sysctl.conf
        /sbin/sysctl -p /etc/sysctl.conf


        echo "### INSTALL PACKAGES"
        yum update -y
        yum install -y amazon-efs-utils aws-cli


        echo "### SETUP EFS"
        EFS_DIR=/mnt/efs
        EFS_ID=${efsId}

        mkdir -p \${EFS_DIR}
        echo "\${EFS_ID}:/ \${EFS_DIR} efs tls,_netdev" >> /etc/fstab

        for i in $(seq 1 20); do mount -a -t efs defaults && break || sleep 60; done

        echo "### SETUP AGENT WITH GPU SUPPORT"

        echo "ECS_CLUSTER=ecs-${configuration.ecsName}-${configuration.account}-${configuration.region}" >> /etc/ecs/ecs.config
        echo "ECS_ENABLE_SPOT_INSTANCE_DRAINING=true" >> /etc/ecs/ecs.config
        echo "ECS_ENABLE_GPU_SUPPORT=true" >> /etc/ecs/ecs.config
        `).toString('base64')
    );

    return userData;
}

async function GetImageId() {
    const image = await
        aws.ec2.getAmi({
                mostRecent: true,
                nameRegex: '.+-ebs$',
                filters: [
                    {
                        name: 'name', values: ['amzn2-ami-ecs-hvm*']
                    },
                    {
                        name: 'architecture', values: ['x86_64']
                    }
                ], owners: ['amazon']
        })
    return image;
}

async function GetGpuImageId() {
    const image = await
        aws.ec2.getAmi({
                mostRecent: true,
                filters: [
                    {
                        name: 'name', values: ['amzn2-ami-ecs-gpu-hvm*']
                    },
                    {
                        name: 'architecture', values: ['x86_64']
                    }
                ], owners: ['amazon']
        })
    return image;
}


async function CreateLaunchTemplate(roleECS,efs,sgEcsNode,kms,configuration) {

    const profile = await new aws.iam.InstanceProfile(`ecs-${configuration.ecsName}-${configuration.account}-${configuration.region}`,{
        name: `ecs-${configuration.ecsName}-${configuration.account}-${configuration.region}`,
        role: roleECS.name
    });

    const image = await GetImageId();
    const userDataCustom = await GetUserData(efs,configuration);

    //fargate if
    const template = await new aws.ec2.LaunchTemplate(`ecs-${configuration.ecsName}`,{
        namePrefix: `ecs-${configuration.ecsName}-${configuration.account}-${configuration.region}`,
        imageId:  image.imageId,
        instanceType: configuration.instanceTypes[0],

        iamInstanceProfile: {
            name: profile.name,
        },

        blockDeviceMappings: [{
            deviceName: '/dev/xvda',
            ebs: {
                volumeSize: configuration.volumeSize,
                encrypted: true,
                kmsKeyId: kms.arn,
                volumeType: "gp3"
            }
        }],


        vpcSecurityGroupIds: [sgEcsNode.id],

        
        userData: userDataCustom

    });

    return template;

}


async function CreateGpuLaunchTemplate(roleECS,efs,sgEcsNode,kms,configuration) {

    const gpuConfig = configuration.gpuCapacityProvider;

    const profile = await new aws.iam.InstanceProfile(`ecs-${configuration.ecsName}-gpu-${configuration.account}-${configuration.region}`,{
        name: `ecs-${configuration.ecsName}-gpu-${configuration.account}-${configuration.region}`,
        role: roleECS.name
    });

    const image = await GetGpuImageId();
    const userDataCustom = await GetGpuUserData(efs,configuration);

    const template = await new aws.ec2.LaunchTemplate(`ecs-${configuration.ecsName}-gpu`,{
        namePrefix: `ecs-${configuration.ecsName}-gpu-${configuration.account}-${configuration.region}`,
        imageId:  image.imageId,
        instanceType: gpuConfig.instanceTypes[0],

        iamInstanceProfile: {
            name: profile.name,
        },

        blockDeviceMappings: [{
            deviceName: '/dev/xvda',
            ebs: {
                volumeSize: gpuConfig.volumeSize,
                encrypted: true,
                kmsKeyId: kms.arn,
                volumeType: "gp3"
            }
        }],


        vpcSecurityGroupIds: [sgEcsNode.id],


        userData: userDataCustom

    });

    return template;

}


module.exports = {
    CreateLaunchTemplate,
    CreateGpuLaunchTemplate
}