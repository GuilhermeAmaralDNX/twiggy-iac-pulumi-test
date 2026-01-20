const aws = require("@pulumi/aws");

async function GetVPC(configuration) {
    const vpc = await aws.ec2.getVpc({filters:[{name: 'tag:Name', values: [`${configuration.account}-VPC`]}]});
    return vpc;
}

async function GetSubnets(vpc) {
    const subnetsPublic = await  aws.ec2.getSubnetIds({filters:[{name:'tag:Scheme',values:['public']}],vpcId: vpc.id});
    const subnetsPrivate = await  aws.ec2.getSubnetIds({filters:[{name:'tag:Scheme',values:['private']}],vpcId: vpc.id});
    const subnetsSecure = await  aws.ec2.getSubnetIds({filters:[{name:'tag:Scheme',values:['secure']}],vpcId: vpc.id});

    return {
        public : subnetsPublic,
        private: subnetsPrivate,
        secure: subnetsSecure
    }
}

module.exports = {
    GetVPC,
    GetSubnets
}