"use strict";
const { CreateRoles, CreateIAMAccountPasswordPolicy } = require('./jobsRoles');
const { CreateCiDeploy } = require('./ciDeployRoles');
const {configuration} = require('./conf');
const {GetOutputRoot} = require('./output');

async function run() {

    const outputRoot = await GetOutputRoot(configuration.pulumiOrg);
    configuration.accountNumber = outputRoot.accounts.value.filter((a) => { if (a.name === configuration.account) return a })[0].account.id;
    configuration.orgName = outputRoot.orgName.value;
    configuration.trustAccountIds.push(configuration.accountNumber = outputRoot.accounts.value.filter((a) => { if (a.name === "shared") return a })[0].account.id)


    if (configuration.enableRoleJobs) {
        await CreateRoles(configuration);
        await CreateIAMAccountPasswordPolicy(configuration);
    }

    await CreateCiDeploy(configuration);

}



run();
