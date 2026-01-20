const aws = require("@pulumi/aws");
const tls = require("@pulumi/tls");
const pulumi = require("@pulumi/pulumi");

const fs = require("fs");

async function CreateSSM() {
   const ssm = await new aws.ssm.Parameter('pritunl-password',{
        type: 'SecureString',
        name: 'pritunl-zero-password',
        value: '-'
    },{
        ignoreChanges: ['value']
    }); 


    return ssm;
}

async function CreateIAMRoleEC2(name,managedPolicies,permissions,region,account) {
    const role = await new aws.iam.Role(name,{
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


    const putParameterPolicy = await new aws.iam.Policy("putParameterPolicy", {
        policy: JSON.stringify({
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Action": [
                        "ssm:PutParameter"
                    ],
                    "Resource": `arn:aws:ssm:${region}:${account}:parameter/pritunl-zero-password`,
                    "Effect": "Allow",
                },
            ],
        })
    });
    
    // Attach the policy to the IAM role
    await new aws.iam.RolePolicyAttachment("rolePolicyAttachment", {
        role: role.name,
        policyArn: putParameterPolicy.arn,
    });

    let indexManaged = 0;
    for (const managedPolicy of managedPolicies) {
        await new aws.iam.RolePolicyAttachment(`${name}-${indexManaged}`,{
            role: role.name,
            policyArn: managedPolicy,
        })
        indexManaged++;
    }

    let attachIndex = 0;
    const roleInstanceProfile = await new aws.iam.InstanceProfile(`${name}-${attachIndex}`,{
        name: name,
        role: role.name
    });


    return  {
        role: role,
        instanceProfile: roleInstanceProfile
    }
    
}

async function CreateSG(name,vpc,internetAccess,ingressRules) {
    const sg = await new aws.ec2.SecurityGroup(`${name}`,{
        vpcId: vpc,
        name: `${name}-sg`,        
    });

        await new aws.ec2.SecurityGroupRule(`${name}-internet`,{
            securityGroupId: sg.id,
            protocol: "-1",
            fromPort: 0,
            toPort: 0,
            type: 'egress',     
            cidrBlocks: ['0.0.0.0/0']       
        });

    let sgIndex = 0;
    for (const ingress of ingressRules) {
        await new aws.ec2.SecurityGroupRule(`${name}-${sgIndex}`,{
            securityGroupId: sg.id,
            fromPort: parseInt(ingress.fromPort),
            toPort: parseInt(ingress.toPort),
            protocol: ingress.protocol,
            type: 'ingress',
            ...(ingress.sourceSecurityGroupId && ({sourceSecurityGroupId: ingress.sourceSecurityGroupId})),
            ...(  ( ingress.cidrBlocks ? ingress.cidrBlocks.length > 0 ? true : false : false   ) &&  ({cidrBlocks: ingress.cidrBlocks}))
        });
        sgIndex++;
    }

return sg;

}

async function GetTemplate(filename,region) {
    let template = await fs.readFileSync(`./template/${filename}`,{encoding: 'utf-8'})
    template = template.replace('VPN_REGION',region)
    return template;
}

async function CreateNIC(name,subnetId,sg) {
    const nic = new aws.ec2.NetworkInterface(`nic-${name}`,{
        subnetId: subnetId,
        securityGroups: [sg]
    },{deleteBeforeReplace: true});
    return nic;
}

async function CreateEC2(instance,nic,profileEC2,region) {

    let keySSH;

    let keyTls;
    if(instance.keyPar) {
        keyTls = await new tls.PrivateKey(instance.name,{
            algorithm: 'RSA',
            rsaBits: 4096
        });
        keySSH = await new aws.ec2.KeyPair(instance.name,{
            publicKey: keyTls.publicKeyOpenssh,
            keyName: `key-${instance.name}`
        });


    }
   
    const image = await
    aws.ec2.getAmi({
            mostRecent: true,
            //nameRegex: '.+-ebs$',
            filters: [
                {
                    name: 'name', values: ['ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*']
                },
                {
                    name: 'architecture', values: ['x86_64']
                },
                {
                    name: 'root-device-type', values: ['ebs']
                }                    
            ], owners: ['amazon']
    });

    const ssm = await CreateSSM();

    const ec2 = await new aws.ec2.Instance(instance.name,{
        ami: image.imageId,
        ...( instance.keyPar && {keyName: keySSH.keyName}),
        instanceType: instance.instanceType,
        monitoring: instance.monitoring,
        iamInstanceProfile: profileEC2,
        networkInterfaces: [{
            networkInterfaceId: nic.id,
            deviceIndex: 0
        }],
        rootBlockDevice: {
            volumeSize: parseInt(instance.volumeSize),
            volumeType: instance.volumeType,
            encrypted: true,            
        },
        //userDataReplaceOnChange: true,
        tags: instance.tags,        
        ...(instance.cloudInitFile.enable && (
            {userDataBase64: Buffer.from(await GetTemplate(instance.cloudInitFile.name,region)  ).toString('base64')  }
        ))        

    },{
        dependsOn: [ssm]
    });
    return {
        instanceName: instance.name,
        instanceId: ec2.id,
        sg: nic.securityGroups,
        privateIp: ec2.privateIp,
        keyTls: instance.keyPar ? keyTls.privateKeyPem : '',
        vpnSecurityGroup: nic.securityGroups[0]
    };
}

async function CreateInstances(instance,vpc,subnet,region,account) {

        const role = await CreateIAMRoleEC2(instance.name,instance.managedPolicies,[],region,account);
        const sg = await CreateSG(instance.name,vpc,instance.internetAccess,instance.ingressRules);
        const nic = await  CreateNIC(instance.name,subnet,sg)
        const ec2 = await CreateEC2(instance,nic,role.instanceProfile.name,region);

        return ec2;
}

module.exports = {
    CreateInstances,
    CreateSSM
}