const aws = require("@pulumi/aws");

async function CreateSGRunner(vpc,configuration) {
    const sg = await new aws.ec2.SecurityGroup(`${configuration.name}-runner-bkct`,{
        namePrefix: `${configuration.name}-security-group-bitbucket`,
        vpcId: vpc.id,
        description: 'A security group containing bitbucket runner instances',
        egress: [{
            fromPort:0,
            toPort:0,
            protocol: "-1",
            cidrBlocks: ["0.0.0.0/0"]
        }]
    });
    return sg;
}


module.exports = {
    CreateSGRunner
}