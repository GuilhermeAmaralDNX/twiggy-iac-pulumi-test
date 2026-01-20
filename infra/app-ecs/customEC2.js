const aws = require("@pulumi/aws");

async function CreateIAMRoleEC2(name, managedPolicies, permissions) {
    const role = await new aws.iam.Role(name, {
        name: name,
        assumeRolePolicy: {
            Version: '2012-10-17',
            Statement: [{
                Effect: 'Allow',
                Action: 'sts:AssumeRole',
                Principal: {
                    Service: ['ec2.amazonaws.com']
                }
            }]
        }

    });


    if (permissions.length > 0) {
        const customPolicy = await new aws.iam.Policy(`pol-${name}`, {
            policy: JSON.stringify({
                "Version": "2012-10-17",
                "Statement": permissions
            })
        });

        await new aws.iam.RolePolicyAttachment(`attach-pol-${name}`, {
            role: role.name,
            policyArn: customPolicy.arn,
        });

    }


    let indexManaged = 0;
    for (const managedPolicy of managedPolicies) {
        await new aws.iam.RolePolicyAttachment(`${name}-${indexManaged}`, {
            role: role.name,
            policyArn: managedPolicy,
        })
        indexManaged++;
    }

    let attachIndex = 0;
    const roleInstanceProfile = await new aws.iam.InstanceProfile(`${name}-${attachIndex}`, {
        name: name,
        role: role.name
    });


    return {
        role: role,
        instanceProfile: roleInstanceProfile
    }

}

async function CreateSG(name, vpc, internetAccess, ingressRules, configuration, vpnAccess, appsAccess,sgApps) {
    const sg = await new aws.ec2.SecurityGroup(`${name}`, {
        vpcId: vpc.id,
        name: `${name}-sg`,
    });


    if (vpnAccess)
        await new aws.ec2.SecurityGroupRule(`ec2-${name}`, {
            description: "Traffic Ingress VPN",
            type: "ingress",
            fromPort: 0,
            toPort: 0,
            protocol: "-1",
            securityGroupId: sg.id,
            sourceSecurityGroupId: configuration.vpnSG
        });



    if (appsAccess)
        await new aws.ec2.SecurityGroupRule(`acec2-${name}`, {
            description: "Traffic Ingress APPS",
            type: "ingress",
            fromPort: 0,
            toPort: 0,
            protocol: "-1",
            securityGroupId: sg.id,
            sourceSecurityGroupId: sgApps
        });

    if (internetAccess)
        await new aws.ec2.SecurityGroupRule(`${name}-internet`, {
            securityGroupId: sg.id,
            protocol: "-1",
            fromPort: 0,
            toPort: 0,
            type: 'egress',
            cidrBlocks: ['0.0.0.0/0']
        });

    let sgIndex = 0;
    for (const ingress of ingressRules) {
        await new aws.ec2.SecurityGroupRule(`${name}-${sgIndex}`, {
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

async function CreateNIC(name, subnetId, sg) {
    const nic = new aws.ec2.NetworkInterface(`nic-${name}`, {
        subnetId: subnetId,
        securityGroups: [sg]
    });
    return nic;
}

async function CreateEC2(instance, nic, profileEC2) {
    const ec2 = await new aws.ec2.Instance(instance.name, {
        ami: instance.ami,
        instanceType: instance.instanceType,
        monitoring: true,
        iamInstanceProfile: profileEC2,
        networkInterfaces: [{
            networkInterfaceId: nic.id,
            deviceIndex: 0
        }],
        rootBlockDevice: {
            volumeSize: instance.volumeSize,
            volumeType: instance.volumeType,
            encrypted: true,
        },
        ...(instance.userDataBase64 && { userDataBase64: instance.userDataBase64 }),
        tags: {
            Name: instance.name,
            Backup: instance.backup
        }

    });
    return ec2;
}

async function CreateInstances(instances, vpc, subnetPrivate, subnetPublic,configuration,sgApps) {
    let ec2Intances = [];
    for (const instance of instances) {
        const role = await CreateIAMRoleEC2(instance.name, instance.managedPolicies, instance.customPermissions);
        const sg = await CreateSG(instance.name, vpc, instance.internetAccess, instance.ingressRules, configuration, instance.vpnAccess,instance.appsAccess,sgApps);
        const nic = await CreateNIC(instance.name, instance.subnetType === 'public' ? subnetPublic : subnetPrivate, sg)
        const ec2 = await CreateEC2(instance, nic, role.instanceProfile.name);
        ec2Intances.push({
            instanceId: ec2.id,
            name: instance.name,
            sg: ec2.securityGroups
        })
    }
}

module.exports = {
    CreateInstances
}