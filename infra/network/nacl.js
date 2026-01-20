const aws = require("@pulumi/aws");
const config = require('./conf');


async function CreateNaclPublic(vpc, subnetPublic, subnetsPrivate,configuration) {


    const nacl = await new aws.ec2.NetworkAcl('ACL-Public', {
        vpcId: vpc.id,
        subnetIds: subnetPublic.map(s=> s.id),
        tags: {
            Name: `${configuration.account}-ACL-Public`,
            Schem: "public",
            EnvName: configuration.account
        }
    });

    //OUT
    const outPublicWorld =await  new aws.ec2.NetworkAclRule("outPublicWorld", {
        networkAclId: nacl.id,
        ruleNumber: 100,
        egress: true,
        protocol: -1,
        ruleAction: "allow",
        cidrBlock: "0.0.0.0/0",
        fromPort: 0,
        toPort: 0,
    });

    //IN
    const inPublicLocal = await new aws.ec2.NetworkAclRule("inPublicLocal", {
        networkAclId: nacl.id,
        ruleNumber: 1,
        egress: false,
        protocol: -1,
        ruleAction: "allow",
        cidrBlock: vpc.cidrBlock,
        fromPort: 0,
        toPort: 0,
    });
 

    const inPublicTcpReturn = await new aws.ec2.NetworkAclRule("inPublicTcpReturn", {
        networkAclId: nacl.id,
        ruleNumber: 201,
        egress: false,
        protocol: "tcp",
        ruleAction: "allow",
        cidrBlock: "0.0.0.0/0",
        fromPort: 1024,
        toPort: 65535,
    });

    const inPublicUdpReturn = await new aws.ec2.NetworkAclRule("inPublicUdpReturn", {
        networkAclId: nacl.id,
        ruleNumber: 401,
        egress: false,
        protocol: "udp",
        ruleAction: "allow",
        cidrBlock: "0.0.0.0/0",
        fromPort: 1024,
        toPort: 65535,
    });

    const inPublicIcmp = await new aws.ec2.NetworkAclRule("inPublicIcmp", {
        networkAclId: nacl.id,
        ruleNumber: 501,
        egress: false,
        protocol: "icmp",
        ruleAction: "allow",
        cidrBlock: "0.0.0.0/0",
        icmpType: 0,
        icmpCode: -1,
    });

    for (let i = 0; i < configuration.PublicNaclInboundTCPPorts.length; i++) {
        const inPublicTcp = await new aws.ec2.NetworkAclRule(`inPublicTcp-${configuration.PublicNaclInboundTCPPorts[i]}`, {
            networkAclId: nacl.id,
            ruleNumber: i + 101,
            egress: false,
            protocol: "tcp",
            ruleAction: "allow",
            cidrBlock: "0.0.0.0/0",
            fromPort: parseInt(configuration.PublicNaclInboundTCPPorts[i]),
            toPort: parseInt(configuration.PublicNaclInboundTCPPorts[i]),
        },{deleteBeforeReplace: true});
    }


    for (let i = 0; i < configuration.PublicNaclInboundUDPPorts.length; i++) {
        const inPublicUDP = await new aws.ec2.NetworkAclRule(`inPublicUDP-${configuration.PublicNaclInboundTCPPorts[i]}`, {
            networkAclId: nacl.id,
            ruleNumber: i + 301,
            egress: false,
            protocol: "tcp",
            ruleAction: "allow",
            cidrBlock: "0.0.0.0/0",
            fromPort: parseInt(configuration.PublicNaclInboundUDPPorts[i]),
            toPort: parseInt(configuration.PublicNaclInboundUDPPorts[i]),
        });
    }


    for (let i = 0; i < subnetsPrivate.length; i++) {
        const inPublicFromPrivate = await new aws.ec2.NetworkAclRule(`infFromPrivate-${i}`, {
            networkAclId: nacl.id,
            ruleNumber: i + 601,
            egress: false,
            protocol: -1,
            ruleAction: "allow",
            cidrBlock: subnetsPrivate[i].cidrBlock,
            fromPort: 0,
            toPort: 0,
        });
    }

}


async function CreateNaclSecure(vpc, subnetSecure, subnetPrivate,configuration) {


    const nacl = await new aws.ec2.NetworkAcl('ACL-Secure', {
        vpcId: vpc.id,
        subnetIds: subnetSecure.map(s => s.id),
        tags: {
            Name: `${configuration.account}-ACL-Secure`,
            Schem: "secure",
            EnvName: configuration.account
        }
    });


//     //OUT
    for (let i = 0; i < subnetSecure.length; i++) {
        const outSecureToSecure = await new  aws.ec2.NetworkAclRule(`outSecureToSecure-${i}`, {
            networkAclId: nacl.id,
            ruleNumber: i + 1,
            egress: true,
            protocol: -1,
            ruleAction: "allow",
            cidrBlock: subnetSecure[i].cidrBlock,
        });

    }


    for (let i = 0; i < subnetPrivate.length; i++) {
        const outSecureToPrivate = await new aws.ec2.NetworkAclRule(`outSecureToPrivate-${i}`, {
            networkAclId: nacl.id,
            ruleNumber: i + 101,
            egress: true,
            protocol: -1,
            ruleAction: "allow",
            cidrBlock: subnetPrivate[i].cidrBlock,
        });

    }



    //IN
    for (let i = 0; i < subnetSecure.length; i++) {
        const inSecureFromSecure = await new aws.ec2.NetworkAclRule(`inSecureFromSecure-${i}`, {
            networkAclId: nacl.id,
            ruleNumber: i + 101,
            egress: false,
            protocol: -1,
            ruleAction: "allow",
            cidrBlock: subnetSecure[i].cidrBlock,
        });
    }


    for (let i = 0; i < subnetPrivate.length; i++) {
        const inSecureFromPrivate = await new aws.ec2.NetworkAclRule(`inSecureFromPrivate-${i}`, {
            networkAclId: nacl.id,
            ruleNumber: i + 201,
            egress: false,
            protocol: -1,
            ruleAction: "allow",
            cidrBlock: subnetPrivate[i].cidrBlock,
        });
    }   
    
    // //S3Ednpotin
    // const managedList = await aws.ec2.getManagedPrefixList({
    //      name: `com.amazonaws.${configuration.region}.s3`,
    // })


    // for (let i = 0; i < managedList.entries.length; i++) {
    //     const inSecureFromS3 = await new aws.ec2.NetworkAclRule(`inSecureFromS3-${i}`, {
    //         networkAclId: nacl.id,
    //         ruleNumber: i + 501,
    //         egress: false,
    //         protocol: -1,
    //         ruleAction: "allow",
    //         cidrBlock: managedList.entries[i].cidr,
    //         fromPort: 0,
    //         toPor: 0
    //     });
        
    // }

    // for (let i = 0; i < managedList.entries.length; i++) {
    //     const outSecureToS3 = await new aws.ec2.NetworkAclRule(`outSecureToS3-${i}`, {
    //         networkAclId: nacl.id,
    //         ruleNumber: i + 501,
    //         egress: true,
    //         protocol: -1,
    //         ruleAction: "allow",
    //         cidrBlock: managedList.entries[i].cidr,
    //         fromPort: 0,
    //         toPort: 0
    //     });
        
    // }    
}

async function CreateNaclPrivate(vpc, subnetPviate,subnetPublic,subnetSecure,configuration) {

    let subnetsSecureCidrBlock = [];
    for (sub of subnetSecure) {
        subnetsSecureCidrBlock.push(sub.cidrBlock);
    }

    

    const nacl = await new aws.ec2.NetworkAcl('ACL-Private', {
        vpcId: vpc.id,
        subnetIds: subnetPviate.map(s=>s.id),
        tags: {
            Name: `${configuration.account}-ACL-Private`,
            Schem: "private",
            EnvName: configuration.account
        }
    });


    //OUT
    const outPublicWorldPrivate =await  new aws.ec2.NetworkAclRule("outPublicWorldPrivate", {
        networkAclId: nacl.id,
        ruleNumber: 1,
        egress: true,
        protocol: -1,
        ruleAction: "allow",
        cidrBlock: "0.0.0.0/0",
        fromPort: 0,
        toPort: 0,
    });    

    //IN
    const inPrivateFromWorldTcp = await new aws.ec2.NetworkAclRule("inPrivateFromWorldTcp", {
        networkAclId: nacl.id,
        ruleNumber: 1,
        egress: false,
        protocol: "tcp",
        ruleAction: "allow",
        cidrBlock: "0.0.0.0/0",
        fromPort:1024,
        toPort: 65535,
    });

    const inPrivateFromWorldICMP = await new aws.ec2.NetworkAclRule("inPrivateFromWorldICMP", {
        networkAclId: nacl.id,
        ruleNumber: 100,
        egress: false,
        protocol: "icmp",
        ruleAction: "allow",
        cidrBlock: "0.0.0.0/0",
        icmpType:0,
        icmpCode: -1,
    });    


    for (let i = 0; i < subnetPviate.length; i++) {
        const inPrivateFromPrivate = await new aws.ec2.NetworkAclRule(`inPrivateFromPrivate-${i}`, {
            networkAclId: nacl.id,
            ruleNumber: i +201,
            egress: false,
            protocol: -1,
            ruleAction: "allow",
            cidrBlock: subnetPviate[i].cidrBlock,
            fromPort:0,
            toPort: 0,
        }); 
    }

    for (let i = 0; i < subnetPublic.length; i++) {
        const inPrivateFromPublic = await new aws.ec2.NetworkAclRule(`inPrivateFromPublic-${i}`, {
            networkAclId: nacl.id,
            ruleNumber: i +301,
            egress: false,
            protocol: -1,
            ruleAction: "allow",
            cidrBlock: subnetPublic[i].cidrBlock,
            fromPort:0,
            toPort: 0,
        }); 
    }    

    for (let i = 0; i < subnetSecure.length; i++) {
        const inPrivateFromSecure = await new aws.ec2.NetworkAclRule(`inPrivateFromSecure-${i}`, {
            networkAclId: nacl.id,
            ruleNumber: i +401,
            egress: false,
            protocol: -1,
            ruleAction: "allow",
            cidrBlock: subnetSecure[i].cidrBlock,
            fromPort:0,
            toPort: 0,
        }); 
    }    

    for (let i = 0; i < configuration.PrivateNaclInbound.length; i++) {
        await new aws.ec2.NetworkAclRule(`inPrivateAclRule-${i}`, {
            networkAclId: nacl.id,
            ruleNumber: i + 800,
            egress: false,
            protocol: configuration.PrivateNaclInbound[i].protocol,
            ruleAction: "allow",
            cidrBlock: configuration.PrivateNaclInbound[i].cidrBlocks,
            fromPort: parseInt(configuration.PrivateNaclInbound[i].fromPort),
            toPort: parseInt(configuration.PrivateNaclInbound[i].toPort),
        },{deleteBeforeReplace: true});
    }
}

module.exports = {
    CreateNaclPublic , CreateNaclSecure, CreateNaclPrivate
}