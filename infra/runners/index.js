const {configuration} =require('./conf');
const sg = require('./sg');
const {GetSubnets, GetVPC} = require('./vpc');
const ec2 = require('./ec2');
const {GetOutputs} = require('./output');

module.exports = async() => {

    const outputRoot = await GetOutputs(configuration.pulumiOrg, configuration.account);
    configuration.accountNumber = outputRoot.accounts.value.filter((a) => { if (a.name === configuration.account) return a })[0].account.id;
    configuration.orgName = outputRoot.orgName.value;    

    const vpc = await GetVPC(configuration);
    const subnets = await GetSubnets(vpc);

    const sgRunner = await sg.CreateSGRunner(vpc,configuration);

    const amiRunner = await ec2.GetAMIRunner();
    const launchTemplate = await ec2.CreateLaunchTemplateRunnerInstance(
        configuration.profileInstance,
        sgRunner,
        amiRunner,
        configuration.runnerType,
        configuration.githubconfig.githubToken,
        configuration.bitbucketConfig,
        configuration.githubconfig.githubOrg,
        `${configuration.name}-${configuration.account}`,
        configuration.githubconfig.githubLabels,
        configuration.tokenpulumi,
        configuration
        )
        
    await ec2.CreateASGRunnerInstance(subnets.private,launchTemplate,configuration);

    return {
        securityGroupRunner: sgRunner.id
    }

}