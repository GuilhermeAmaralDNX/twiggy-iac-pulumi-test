const aws = require("@pulumi/aws");

async function CreateSGRunner(vpc,configuration) {
    const sg = await new aws.ec2.SecurityGroup(`${configuration.name}-runner`,{
        namePrefix: `${configuration.name}-security-group`,
        vpcId: vpc.id,
        description: 'A security group containing gitlab-runner agent instances',
        egress: [{
            fromPort:0,
            toPort:0,
            protocol: "-1",
            cidrBlocks: ["0.0.0.0/0"]
        }]
    });
    return sg;
}
//RF
async function CreateSGDockerMachine(vpc,sgAgent,configuration) {
    const sg = await new aws.ec2.SecurityGroup(`${configuration.name}-docker-machine`,{
        namePrefix: `${configuration.name}-docker-machine`,
        vpcId: vpc.id,
        description: 'A security group containing docker-machine instances',
    });    

    const sgRuledockerAgent = await new aws.ec2.SecurityGroupRule(`${configuration.name}-docker-agent`,{
        type : 'ingress',
        fromPort: 2376,
        toPort: 2376,
        protocol: 'tcp',
        sourceSecurityGroupId: sgAgent.id,
        securityGroupId: sg.id,
        description: 'Allow docker-machine traffic from group  to docker-machine instances in group '
    });

    const sgRuleDockerAgentSsh = await new aws.ec2.SecurityGroupRule(`${configuration.name}-docker-agent-ssh`,{
        type : 'ingress',
        fromPort: 22,
        toPort: 22,
        protocol: 'tcp',
        sourceSecurityGroupId: sgAgent.id,
        securityGroupId: sg.id,
        description: 'Allow SSH traffic from to docker-machine instances in group  on port 22'
    });

    const sgRuleDockerAgentPing = await new aws.ec2.SecurityGroupRule(`${configuration.name}-docker-machine-ping-runner`,{
        type : 'ingress',
        fromPort: -1,
        toPort: -1,
        protocol: 'icmp',
        sourceSecurityGroupId: sgAgent.id,
        securityGroupId: sg.id,
        description: 'Allow ICMP traffic from agent to docker-machine instances in group'
    });

    // Docker-machine instances to self
    const sgRuleSelf = await new aws.ec2.SecurityGroupRule(`${configuration.name}-docker-machine-self`,{
        type : 'ingress',
        fromPort: 2376,
        toPort: 2376,
        protocol: 'tcp',
        self: true,
        securityGroupId: sg.id,
        description: 'Allow docker-machine traffic within group on port 2376'
    });

    const sgRuleSSHSelf = await new aws.ec2.SecurityGroupRule(`${configuration.name}-docker-machine-ssh-self`,{
        type : 'ingress',
        fromPort: 22,
        toPort: 22,
        protocol: 'tcp',
        self: true,
        securityGroupId: sg.id,
        description: 'Allow SSH traffic within group on port 22'
    });


    const sgRulePingSelf = await new aws.ec2.SecurityGroupRule(`${configuration.name}-docker-machine-ping-self`,{
        type : 'ingress',
        fromPort: -1,
        toPort: -1,
        protocol: 'icmp',
        self: true,
        securityGroupId: sg.id,
        description: 'Allow ICMP traffic within group'
    });

    const sgRuleEgressMachine = await new aws.ec2.SecurityGroupRule(`${configuration.name}-egress-docker-machine`,{
        type : 'egress',
        fromPort: 1,
        toPort: 65535,
        protocol: '-1',
        securityGroupId: sg.id,
        cidrBlocks: ['0.0.0.0/0'],
        description: 'Allow egress traffic for group'
    });


    return sg;

}

module.exports = {
    CreateSGRunner,
    CreateSGDockerMachine
}