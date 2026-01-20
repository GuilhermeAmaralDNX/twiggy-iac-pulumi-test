const cache = require('./cache');
const iam = require('./iam');
const sg = require('./sg');
const {GetSubnets, GetVPC} = require('./vpc');
const ec2 = require('./ec2');
const {configuration} =require('./conf');
const {GetOutputs} = require('./output');

module.exports = async() => {

    const outputRoot = await GetOutputs(configuration.pulumiOrg, configuration.account);
    configuration.accountNumber = outputRoot.accounts.value.filter((a) => { if (a.name === configuration.account) return a })[0].account.id;
    configuration.orgName = outputRoot.orgName.value;    

    const vpc = await GetVPC(configuration);
    const subnets = await GetSubnets(vpc);

    const s3 = await cache.CreateS3Cache(configuration);
    const policyS3 = await cache.S3CachePolicy(s3,configuration);

    const roleInstance = await iam.CreateRoleInstance(configuration);
    const profileInstance = await iam.CreateInstanceProfile(roleInstance,configuration);
    await iam.AttachInstancePolicies(roleInstance,policyS3,configuration);
    await iam.CreateSSMPolicy(roleInstance,configuration);

    const roleMachine = await iam.CreateRoleDockerMachine(configuration);
    const profileMachine = await iam.CreateInstanceProfileDockerMachine(roleMachine,configuration);
    await iam.AttachDockerMachineePolicies(roleMachine,configuration);

    const sgAgent = await sg.CreateSGRunner(vpc,configuration);
    const sgMachine = await  sg.CreateSGDockerMachine(vpc,sgAgent,configuration);

    const amiRunner = await ec2.GetAMIRunner();
    // const templates = await ec2.RenderTemplateFiles(s3,amiRunner.id,sgAgent.id,profileInstance.name,sgMachine.id, vpc.id,subnets.private.ids[0]);
    const amiMachine = await ec2.GetAMIDockerMachine();
    const templates = await ec2.RenderTemplateFiles(s3.bucket,amiRunner.id,sgAgent.name,profileInstance.name,sgMachine.id, vpc.id,subnets.private.ids[0],configuration);
    await ec2.CreateSSMToken(configuration);
    const launchTemplate = await ec2.CreateLaunchTemplateRunnerInstance(profileInstance,sgAgent,templates.userDataRender,amiMachine,configuration );
    await ec2.CreateASGRunnerInstance(subnets.private,launchTemplate,configuration);

}