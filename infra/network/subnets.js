const aws = require("@pulumi/aws");
const util = require('./utils');

const newbits = 5;
const publicNetNumOffset = 0;
const privateNetNumOffset = 5;
const secureNetNumOffset = 10;


async function CreateSubnetPublic(vpc, ig, vpcS3, configuration) {

    let subnets = [];
    const azs = await aws.getAvailabilityZones({ state: 'available', filters: [{ name: 'region-name', values: [configuration.region] }] });
    for (let i = 0; i < configuration.maxAz; i++) {

        let tagsValues = new Object();
        tagsValues['Name'] = `${configuration.account}-Subnet-Public-${azs.names[i].split('-')[2].toUpperCase()}`;
        tagsValues['Scheme'] = 'public';
        tagsValues['EnvName'] = configuration.account;
        tagsValues['kubernetes.io/role/elb'] = 1;

        for (const eks of configuration.eksClusters) {
            tagsValues[`kubernetes.io/cluster/${eks}`] = 'shared';
        }

        const subnet = await new aws.ec2.Subnet(`public-${i}`, {
            vpcId: vpc.id,
            cidrBlock: util.cidrSubnet(configuration.cidrBlock, newbits, i + publicNetNumOffset),
            availabilityZone: azs.names[i],
            mapPublicIpOnLaunch: true,
            tags: tagsValues
        });
        subnets.push(subnet);
    }


    const route = await new aws.ec2.RouteTable('public', {
        vpcId: vpc.id,
        tags: {
            Name: `${configuration.account}-RouteTable-Public`,
            Scheme: "public",
            EnvName: configuration.account
        }
    });

    const publicInternetRoute = await new aws.ec2.Route("public", {
        routeTableId: route.id,
        destinationCidrBlock: "0.0.0.0/0",
        gatewayId: ig.id,
    });

    for (let i = 0; i < configuration.maxAz; i++) {
        const routeAssociation = await new aws.ec2.RouteTableAssociation(`public-${i}`, {
            routeTableId: route.id,
            //gatewayId: ig.id,
            subnetId: subnets[i].id
        })
    }

    const vpcEdnpointAssociation = await new aws.ec2.VpcEndpointRouteTableAssociation('public', {
        routeTableId: route.id,
        vpcEndpointId: vpcS3.id
    })

    return subnets;

}

async function CreateSubnetPrivate(vpc, ig, vpcS3, natGwts, configuration) {

    let subnets = [];
    const azs = await aws.getAvailabilityZones({ state: 'available', filters: [{ name: 'region-name', values: [configuration.region] }] });
    for (let i = 0; i < configuration.maxAz; i++) {

        let tagsValues = new Object();
        tagsValues['Name'] = `${configuration.account}-Subnet-Private-${azs.names[i].split('-')[2].toUpperCase()}`;
        tagsValues['Scheme'] = 'private';
        tagsValues['EnvName'] = configuration.account;
        tagsValues['kubernetes.io/role/internal-elb'] = 1;

        for (const eks of configuration.eksClusters) {
            tagsValues[`kubernetes.io/cluster/${eks}`] = 'shared';
        }

        const subnet = await new aws.ec2.Subnet(`private-${i}`, {
            vpcId: vpc.id,
            cidrBlock: util.cidrSubnet(configuration.cidrBlock, newbits, i + privateNetNumOffset),
            availabilityZone: azs.names[i],
            mapPublicIpOnLaunch: false,
            tags: tagsValues
        });
        subnets.push(subnet);
    }



    return subnets;


}

async function CreateSubnetSecure(vpc, vpcS3, configuration) {

    let subnets = [];
    const azs = await aws.getAvailabilityZones({ state: 'available', filters: [{ name: 'region-name', values: [configuration.region] }] });
    for (let i = 0; i < configuration.maxAz; i++) {
        const subnet = await new aws.ec2.Subnet(`secure-${i}`, {
            vpcId: vpc.id,
            cidrBlock: util.cidrSubnet(configuration.cidrBlock, newbits, i + secureNetNumOffset),
            availabilityZone: azs.names[i],
            mapPublicIpOnLaunch: false,
            tags: {
                Name: `${configuration.account}-Subnet-Secure-${azs.names[i].split('-')[2].toUpperCase()}`,
                Scheme: "secure",
                EnvName: configuration.account
            }
        });
        subnets.push(subnet);
    }

    const route = await new aws.ec2.RouteTable('secure', {
        vpcId: vpc.id,
        tags: {
            Name: `${configuration.account}-RouteTable-Secure`,
            Scheme: "secure",
            EnvName: configuration.account
        }
    });

    for (let i = 0; i < configuration.maxAz; i++) {
        const routeAssociation = await new aws.ec2.RouteTableAssociation(`secure-${i}`, {
            routeTableId: route.id,
            subnetId: subnets[i].id
        }, { ignoreChanges: ['subnetId'] })
    }


    const vpcEdnpointAssociation = await new aws.ec2.VpcEndpointRouteTableAssociation('secure', {
        routeTableId: route.id,
        vpcEndpointId: vpcS3.id
    })

    return subnets;

}

async function CreateElasticIP(configuration) {
    const maxNat = configuration.enableMultiNat ? configuration.maxAz : 1;

    let eips = [];

    for (let i = 0; i < maxNat; i++) {
        const eip = await new aws.ec2.Eip(`natIP-${i}`, {
            vpc: true,
            tags: {
                Name: `${configuration.account}-EIP-${i}`,
                EnvName: configuration.account
            }
        });
        eips.push(eip);
    }
    return eips;
}

async function CreateNatGateway(eips, subnetsPublic, configuration) {
    const maxNat = configuration.enableMultiNat ? configuration.maxAz : 1;

    let nats = [];

    for (let i = 0; i < maxNat; i++) {
        const nat = await new aws.ec2.NatGateway(`NatGw-${i}`, {
            allocationId: eips[i].id,
            subnetId: subnetsPublic[i].id,
            tags: {
                Name: `${configuration.account}-NATGW-${i}`,
                EnvName: configuration.account
            }
        });
        nats.push(nat)
    }

    return nats;
}

async function CreateNatInstance(eips, subnetsPublic, subnetsPrivates, configuration,vpc) {

    const sg = await new aws.ec2.SecurityGroup(`nat-${configuration.account}`, {
        vpcId: vpc.id,
        name: `nat-${configuration.account}-sg`,
    });

    await new aws.ec2.SecurityGroupRule(`nat-outbound`, {
        securityGroupId: sg.id,
        protocol: "-1",
        fromPort: 0,
        toPort: 0,
        type: 'egress',
        cidrBlocks: ['0.0.0.0/0']
    });


    await new aws.ec2.SecurityGroupRule(`nat-inbound`, {
        securityGroupId: sg.id,
        fromPort: 0,
        toPort: 0,
        protocol: "-1",
        type: 'ingress',
        cidrBlocks: subnetsPrivates.map(s => s.cidrBlock),
    });


    const nic = await new aws.ec2.NetworkInterface(`nat-${configuration.account}`, {
        subnetId: subnetsPublic[0].id,
        sourceDestCheck: false,
        securityGroups: [sg.id],
        tags: {
            Name: `nic-nat-instance-${configuration.account}`,
            Function: 'NAT-instance'
        }
    });    

    await new aws.ec2.EipAssociation(`eip-assoc-${configuration.account}`, {
        networkInterfaceId: nic.id,
        allocationId: eips[0].id
    });    

    const image = await
        aws.ec2.getAmi({
                mostRecent: true,
                //nameRegex: '.+-ebs$',
                filters: [
                    {
                        name: 'name', values: ['al2023-ami-2023*']
                    },
                    {
                        name: 'architecture', values: ['x86_64']
                    },
                    {
                        name: 'root-device-type', values: ['ebs']
                    }                    
                ], owners: ['amazon']
        })

    const userData = await Buffer.from(`#!/bin/sh
sudo yum install iptables-services -y
sudo systemctl enable iptables
sudo systemctl start iptables
echo "net.ipv4.ip_forward=1" > /etc/sysctl.d/custom-ip-forwarding.conf
sudo sysctl -p /etc/sysctl.d/custom-ip-forwarding.conf
netstat_output=$(netstat -i)
found_interface=$(echo "$netstat_output" | grep -oE '(eth0|enX0|ens5)')
sudo /sbin/iptables -t nat -A POSTROUTING -o $found_interface -j MASQUERADE
sudo /sbin/iptables -F FORWARD
sudo service iptables save`).toString('base64');

    const roleEc2Nat = await new aws.iam.Role("nat-instance", {
        name: `nat-instance-${configuration.account}-${configuration.region}`,
        assumeRolePolicy: `{
            "Version": "2012-10-17",
            "Statement": [
              {
                "Action": "sts:AssumeRole",
                "Principal": {
                  "Service": "ec2.amazonaws.com"
                },
                "Effect": "Allow",
                "Sid": ""
              }
            ]
          }
          
          `});

    await new aws.iam.RolePolicyAttachment("ec2NatSSM", {
        role: roleEc2Nat.name,
        policyArn: "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
    });



      const instanceProfile = await new aws.iam.InstanceProfile(`nat-profile`,{
        name: `nat-instance-${configuration.account}-${configuration.region}`,
        role: roleEc2Nat.name
    });



    const launchTemplate = await new aws.ec2.LaunchTemplate(`tlp-nat-${configuration.account}`, {
        namePrefix: `tlp-nat-${configuration.account}`,
        imageId: image.imageId,
        instanceType: configuration.instanceTypesNat[0],
        networkInterfaces: [{
            networkInterfaceId: nic.id,
            networkCardIndex: 0,
        }],
        iamInstanceProfile: {
            name: instanceProfile.name
        },
        blockDeviceMappings: [{
            deviceName: '/dev/xvda',
            ebs: {
                volumeSize: 30,
            }
        }],
        monitoring: {
            enabled: true
        },
        // vpcSecurityGroupIds: [sg],

        userData: userData,

    });

    await new aws.autoscaling.Group(`nat-${configuration.account}`,{
        namePrefix: `nat-${configuration.account}`,
        desiredCapacity: 1,
        maxSize: 1,
        minSize: 1,
        //vpcZoneIdentifiers: [subnetsPublic[0].id],
        availabilityZones: [subnetsPublic[0].availabilityZone],
        mixedInstancesPolicy: {
            instancesDistribution: {
                onDemandBaseCapacity: 0,
                onDemandPercentageAboveBaseCapacity: 0
            },
            launchTemplate: {
                launchTemplateSpecification: {
                    launchTemplateId: launchTemplate.id,
                    version: "$Latest"
                },
                overrides: configuration.instanceTypesNat.map( function(i) {
                    return {instanceType: i}
                })
            },            
        },

        tags: [{
            key: 'Name',
            value: `nat-instance-${configuration.account}`,
            propagateAtLaunch: true

        }],

        capacityRebalance: false,
        protectFromScaleIn: false
    });


    return nic;
}

async function CretaeDBSubnet(subnetsSecure, configuration) {

    const subnetDB = await new aws.rds.SubnetGroup(`${configuration.account}-dbsubnet`, {
        name: `${configuration.account}-dbsubnet`,
        subnetIds: subnetsSecure.map(s => s.id),
        tags: {
            Name: `${configuration.account}-dbsubnet`,
            Scheme: "secure",
            EnvName: configuration.account
        }
    });
}

async function ConfigureRouteTablePrivate(configuration,vpc,nic,subnets,vpcS3,natGwts) {
    
    const maxNat = configuration.enableMultiNat ? configuration.maxAz : 1;
    let routesTables = [];
    const maxGateways = configuration.createNatGateway ? maxNat : 1;
    for (let i = 0; i < maxGateways; i++) {

        const route = await new aws.ec2.RouteTable('private', {
            vpcId: vpc.id,
            tags: {
                Name: `${configuration.account}-RouteTable-Private-${i}`,
                Scheme: "private",
                EnvName: configuration.account
            }
        });
        routesTables.push(route);

    }

    let routes = [];
    for (let i = 0; i < maxGateways; i++) {
        const publicInternetRoute = await new aws.ec2.Route(`private-${i}`, {
            routeTableId: routesTables[i].id,
            destinationCidrBlock: "0.0.0.0/0",
            ...(configuration.createNatGateway && {natGatewayId: natGwts[i].id}),
            ...(!configuration.createNatGateway && {networkInterfaceId: nic.id}),            
        });
        routes.push(publicInternetRoute);
    }

    for (let i = 0; i < configuration.maxAz; i++) {
        const routeAssociation = await new aws.ec2.RouteTableAssociation(`private-${i}`, {
            routeTableId: configuration.enableMultiNat ? routesTables[i].id : routesTables[configuration.enableMultiNat ? i : 0].id,
            subnetId: subnets[i].id
        },{ignoreChanges:['subnetId']})
    }

    for (let i = 0; i < configuration.maxAz; i++) {
        const vpcEdnpointAssociation = await new aws.ec2.VpcEndpointRouteTableAssociation(`private-${i}`, {
            routeTableId: configuration.enableMultiNat ? routesTables[i].id : routesTables[configuration.enableMultiNat ? i : 0].id,
            vpcEndpointId: vpcS3.id
        })
    }

    // for (let i = 0; i < configuration.maxAz; i++) {
    //     const vpcEdnpointAssociationLambda = await new aws.ec2.VpcEndpointRouteTableAssociation(`lambda-${i}`, {
    //         routeTableId: configuration.enableMultiNat ? routesTables[i].id : routesTables[configuration.enableMultiNat ? i : 0].id,
    //         vpcEndpointId: vpcLambda.id
    //     })
    // }
}

module.exports = {
    CreateElasticIP,
    CreateSubnetPublic,
    CreateNatGateway,
    CreateSubnetPrivate,
    CreateSubnetSecure,
    CretaeDBSubnet,
    CreateNatInstance,
    ConfigureRouteTablePrivate
}