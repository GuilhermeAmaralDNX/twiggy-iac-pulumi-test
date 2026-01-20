"use strict";
const { CreateOrganizations } = require('./organizations');
const { CreateAccounts } = require('./account');
const { CreateRoleInfraDeployAccess } = require('./rolesAccount');
const { AssingSSOUsersAccount } = require('./sso');
const { CreateSNSBudget, CreateBudgetAlert } = require('./budget');
const { CreateRoleLambdaNotification, CreateLambdaNotfication } = require('./lambda');
const { CreateCostAnomalySNSTopic, CreateEmailSubscriptionsToCostAnomalySNS, CreateCostAnomalyMonitor, CreateCostAnomalySubscription } = require('./costAnomaly')
const { configuration } = require('./conf')

module.exports = async () => {
    
    let accounts;
    let accountIds = [];

    if (configuration.isCreateAccounts) {
        const organization = await CreateOrganizations();
        accounts = await CreateAccounts(organization);
        for (const accountItem of accounts) {
            const id = await accountItem.account.id.promise();
            accountIds.push(id);
        }
    } else {
        accounts = configuration.accounts;
        accountIds = accounts.map(accountItem => accountItem.account.id);
    }

    await CreateRoleInfraDeployAccess(accounts);

    if (configuration.createSSO)
        await AssingSSOUsersAccount(accounts);

    if (configuration.notification.enabled) {
        const sns = await CreateSNSBudget();
        await CreateBudgetAlert(sns);
        const role = await CreateRoleLambdaNotification();
        await CreateLambdaNotfication(role, sns);
    }

    if (configuration.costAnomalyDetection.enabled) {
        const anomalySNSTopic = await CreateCostAnomalySNSTopic();
        await CreateEmailSubscriptionsToCostAnomalySNS(anomalySNSTopic);
        const anomalyMonitor = await CreateCostAnomalyMonitor(accountIds);
        await CreateCostAnomalySubscription(anomalyMonitor, anomalySNSTopic);
    }

    return {
        accounts: accounts,
        orgName: configuration.orgName,
        orgPulumi: configuration.orgPulumi
    };
}
