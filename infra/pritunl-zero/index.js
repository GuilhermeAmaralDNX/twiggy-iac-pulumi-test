const aws = require("@pulumi/aws");
const { CreateInstances, CreateSSM } = require('./ec2');
const {configuration} = require('./conf');
const {CreateLBs} = require('./loadbalance')
const {CreateRecordExternal} = require('./route53');
const {GetOutputs} = require('./output');

module.exports = async () => {

    const outputRoot = await GetOutputs(configuration.pulumiOrg,configuration.account);
    configuration.accountNumber = outputRoot.accounts.value.filter((a) => { if (a.name === configuration.account) return a })[0].account.id;
    configuration.orgName = outputRoot.orgName.value;

    if (configuration.useDefaultCertificate) {
        configuration.certificateARN = outputRoot.defaultCertificate.value.arn;
    }

    if (configuration.useDefaultDomain) {
        configuration.domainName = outputRoot.defaultDomain.value[0].name;
    }

    const vpc = await aws.ec2.getVpc({ filters: [{ name: 'tag:Name', values: [`${configuration.account}-VPC`] }] });
    const privateSubnets = await aws.ec2.getSubnets({ 
        filters: [
            { name: 'vpc-id', values: [vpc.id] },
            { name: 'tag:Scheme', values: ['private'] }
        ]
    });
    const publicSubnets = await aws.ec2.getSubnets({ 
        filters: [
            { name: 'vpc-id', values: [vpc.id] },
            { name: 'tag:Scheme', values: ['public'] }
        ]
    });
    const instance = await CreateInstances(configuration.instanceConfig, vpc.id, privateSubnets.ids[0], configuration.region, configuration.account);
    
    let lbConfig = configuration.loadBalance;

     lbConfig.targets.push({
        name: "pritunl-zero",
        listenerProtocol: "TLS",
        certificateArn: configuration.certificateARN,
        targetPort: 443,
        targetProtocol: "TLS",
        targetId: instance.privateIp.apply(a=> `${a}`),
        targetType: 'ip'
    });

    lbConfig.targets.push({
        name: "pritunl-zero",
        listenerProtocol: "TCP",
        targetPort: 80,
        targetProtocol: "TCP",
        targetId: instance.privateIp.apply(a=> `${a}`),
        targetType: 'ip'
    });

    const lb = await CreateLBs(lbConfig,vpc.id,publicSubnets.ids);

    await CreateRecordExternal('pritunl-zero',configuration.domainName,lb)

    return {
        vpnSecurityGroupVPN: instance.vpnSecurityGroup
    }

}