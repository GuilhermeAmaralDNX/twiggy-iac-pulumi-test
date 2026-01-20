const random = require('@pulumi/random');
const {configuration} = require('./conf');
const { CreateRole, CreateVault, CreateBackupPlan, BackupTagSelection } = require('./backup');
const { CreateRoleLogExporter, CreateLambdaLogExporter } = require('./logExporter');
const { CreateECRREpo } = require('./ecr');
const { CreateACM } = require('./acm');
const repo = require('./repo')
const {GetOutputs} = require('./output');
const { CreateScheduler } = require('./scheduler');

module.exports = async () => {

    const outputs = await GetOutputs(configuration.pulumiOrg,configuration.account,configuration.skipNetwork);
    configuration.accountNumber = outputs.accounts.value.filter((a) => { if (a.name === configuration.account) return a })[0].account.id;
    configuration.orgName = outputs.orgName.value;

    if(configuration.useDefaultDomain) {
        let defaultCert = {
            name: outputs.defaultDomain.value[0].name,
            validate: 'true',
            domains: [outputs.defaultDomain.value[0].name,`*.${outputs.defaultDomain.value[0].name}`]
        }
        configuration.certificates.push(defaultCert);
    }


    if (configuration.account === 'shared') {
        othersAccount = outputs.accounts.value.filter((a) => { if (a.name != 'shared') return a }).map(a => {return a.account.id});
        configuration.ecrTrustAccounts = configuration.ecrTrustAccounts.concat(othersAccount)
    }


    //Backup
    const role = await CreateRole();
    const vault = await CreateVault(configuration);
    const plan = await CreateBackupPlan(vault,configuration);
    await BackupTagSelection(plan, role,configuration);


    //logExport
    const randomString = new random.RandomString("random", {
        length: 8,
        number: false,
        special: false,
        upper: false,
    });

    const roleLogExpoter = await CreateRoleLogExporter(randomString,configuration);
    await CreateLambdaLogExporter(roleLogExpoter, randomString,configuration);


    await CreateECRREpo(configuration);


    // // //ACM
    const certs = await CreateACM(configuration);

    if (configuration.scheduleStartStopResources.enable === "true")
    await CreateScheduler(configuration.account, configuration.region, config.scheduleStartStopResources);

    // //Repo and Pipeline
    // if (configuration.repositories.length > 0 ) {
    //     const repositories = await repo.CreateMultiRepository();
    //     const s3 = await repo.CreateS3();
    //     const kms = await repo.CreateKMS();
    //     const rolePipeline = await repo.CreateRoleCodePipeline(s3);
    //     const roleCodeBuild = await repo.CreateRoleCodeBuild(s3);
    //     const project = await repo.CreateProjects(roleCodeBuild, repositories);
    //     await repo.CreateMultiRepoPipeline(repositories, rolePipeline, kms, s3)
    //     await repo.CreateSSMParameter();


    // }

   return {
    defaultCertificate: certs[0],
    certificates: certs
   };

}